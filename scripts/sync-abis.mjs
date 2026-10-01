// Regenerates src/abis/*.ts from the smart-contract commit pinned in src/abis/source.json.
//
//   pnpm abi:sync               rebuild from the pinned commit
//   pnpm abi:sync --pin <sha>   move the pin to <sha> (full 40-char sha), then rebuild
//
// By default the pinned commit is cloned into .cache/smart-contract. To reuse a checkout
// that already has its submodules, set SMART_CONTRACT_DIR; it must sit exactly on the
// pinned commit with a clean tree, otherwise the ABIs would not be the ones the pin names.
//
// The same pattern as the indexer's `abi:sync`, with one difference: the indexer decodes
// logs and keeps events, the frontend calls contracts and keeps the functions it calls plus
// every error a call can revert with.
//
// Requires git and forge (Foundry) on PATH.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/abis");
const SOURCE_FILE = join(OUT_DIR, "source.json");

// Output file -> the forge artifacts it is assembled from, and the functions and events kept
// from them. Only what the app calls or reads is kept, so the list below is the whole contract
// surface of the frontend: a function missing here cannot be called by accident.
// PositionManager is four artifacts because the ERC-721 surface, the permit and the
// unordered nonces are declared in interfaces IPositionManager does not inherit from.
const TARGETS = {
  FarmentaMarket: {
    artifacts: ["FarmentaMarket.sol/FarmentaMarket.json"],
    functions: [
      // lender (ERC-4626)
      "asset",
      "balanceOf",
      "convertToAssets",
      "deposit",
      "maxWithdraw",
      "totalAssets",
      "withdraw",
      // borrower
      "accrue",
      "borrow",
      "collectFees",
      "debtOf",
      "decreaseLiquidity",
      "depositCollateralWithPermit",
      "loanOf",
      "repay",
      "withdrawCollateral",
      // wiring and state
      "oracle",
      "paused",
      "policy",
      "positionManager",
      "tier",
      "valuer",
    ],
    // Which positions a wallet deposited: `owner` is indexed.
    events: ["CollateralDeposited"],
  },
  PositionValuer: {
    artifacts: ["PositionValuer.sol/PositionValuer.json"],
    functions: ["value"],
  },
  PriceOracle: {
    artifacts: ["PriceOracle.sol/PriceOracle.json"],
    // Never sent: run inside an `eth_call` ahead of a read, to price a meme position the way
    // the transaction will, which records the pool's price before it values anything.
    functions: ["record"],
  },
  MarketLens: {
    artifacts: ["MarketLens.sol/MarketLens.json"],
    functions: ["healthFactor", "market", "maxBorrow", "positionValue"],
  },
  CollateralPolicy: {
    artifacts: ["CollateralPolicy.sol/CollateralPolicy.json"],
    functions: ["acceptsNewPositions", "termsOf"],
  },
  PositionManager: {
    artifacts: [
      "IPositionManager.sol/IPositionManager.json",
      "IERC721.sol/IERC721.json",
      "IERC721Permit_v4.sol/IERC721Permit_v4.json",
      "IUnorderedNonce.sol/IUnorderedNonce.json",
    ],
    functions: ["DOMAIN_SEPARATOR", "getApproved", "getPoolAndPositionInfo", "getPositionLiquidity", "nonces", "ownerOf"],
    // Which positions a wallet received: `to` is indexed.
    events: ["Transfer"],
  },
};

// Every artifact a user transaction can revert from. The market runs its logic in linked
// libraries by delegatecall and calls the policy, the oracle, the valuer and PositionManager,
// so their errors surface from a market call with the market's address on them. The market's
// own artifact already carries what it inherits from OpenZeppelin (`EnforcedPause`,
// `ERC4626ExceededMaxWithdraw`, the ERC-20 errors of its share token).
const ERROR_ARTIFACTS = [
  "FarmentaMarket.sol/FarmentaMarket.json",
  "MarketDebt.sol/MarketDebt.json",
  "MarketMint.sol/MarketMint.json",
  "MarketLiquidity.sol/MarketLiquidity.json",
  "CollateralPolicy.sol/CollateralPolicy.json",
  "PriceOracle.sol/PriceOracle.json",
  "PositionValuer.sol/PositionValuer.json",
  "TwapRecorder.sol/TwapRecorder.json",
  "IPositionManager.sol/IPositionManager.json",
  // PositionManager's check of the minimums a removal of liquidity is sent with.
  "SlippageCheck.sol/SlippageCheck.json",
  "IERC721Permit_v4.sol/IERC721Permit_v4.json",
  "IUnorderedNonce.sol/IUnorderedNonce.json",
];

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function fail(message) {
  console.error(`abi:sync: ${message}`);
  process.exit(1);
}

const source = JSON.parse(readFileSync(SOURCE_FILE, "utf8"));

const pinIndex = process.argv.indexOf("--pin");
if (pinIndex !== -1) {
  const sha = process.argv[pinIndex + 1];
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) fail("--pin takes a full 40-character commit sha");
  source.commit = sha;
}

function prepareCheckout() {
  const external = process.env.SMART_CONTRACT_DIR;
  if (external) {
    const dir = resolve(ROOT, external);
    const head = run("git", ["rev-parse", "HEAD"], dir);
    if (head !== source.commit) fail(`${dir} is at ${head}, but the pin is ${source.commit}`);
    if (run("git", ["status", "--porcelain"], dir) !== "") fail(`${dir} has uncommitted changes`);
    return dir;
  }

  const dir = join(ROOT, ".cache/smart-contract");
  if (!existsSync(dir)) {
    mkdirSync(dirname(dir), { recursive: true });
    run("git", ["clone", "--no-checkout", source.repo, dir], ROOT);
  }
  run("git", ["fetch", "origin"], dir);
  run("git", ["checkout", "--detach", "--force", source.commit], dir);
  run("git", ["submodule", "update", "--init", "--depth", "1"], dir);
  // Not --recursive: that also pulls each library's own test dependencies, which is most
  // of the download. The nested submodules the build needs are exactly the ones
  // remappings.txt points into (lib/<a>/lib/<b>/).
  const nested = new Set();
  for (const line of readFileSync(join(dir, "remappings.txt"), "utf8").split("\n")) {
    const match = line.match(/=(lib\/[^/]+)\/(lib\/[^/]+)\//);
    if (match) nested.add(`${match[1]} ${match[2]}`);
  }
  for (const entry of nested) {
    const [parent, child] = entry.split(" ");
    run("git", ["submodule", "update", "--init", "--depth", "1", child], join(dir, parent));
  }
  return dir;
}

const checkout = prepareCheckout();
console.log(`abi:sync: building ${source.commit} in ${checkout}`);
run("forge", ["build", "--skip", "test", "--skip", "script"], checkout);

function artifactAbi(artifact) {
  const file = join(checkout, "out", artifact);
  if (!existsSync(file)) fail(`the build has no artifact ${artifact}`);
  return JSON.parse(readFileSync(file, "utf8")).abi;
}

// Two artifacts may declare the same entry; keep one copy per signature.
function signature(entry) {
  const types = (inputs) =>
    inputs.map((input) => (input.type.startsWith("tuple") ? `(${types(input.components)})${input.type.slice(5)}` : input.type));
  return `${entry.name}(${types(entry.inputs).join(",")})`;
}

function sorted(entries) {
  return [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => entry);
}

function write(name, note, abi) {
  const constName = `${name[0].toLowerCase()}${name.slice(1)}Abi`;
  const body =
    `// Generated by \`pnpm abi:sync\` from smart-contract@${source.commit}. Do not edit.\n` +
    `// ${note}\n` +
    `export const ${constName} = ${JSON.stringify(abi, null, 2)} as const;\n`;
  writeFileSync(join(OUT_DIR, `${name}.ts`), body);
}

for (const [name, target] of Object.entries(TARGETS)) {
  const wanted = { function: target.functions, event: target.events ?? [] };
  const kept = { function: new Map(), event: new Map() };
  for (const artifact of target.artifacts) {
    for (const entry of artifactAbi(artifact)) {
      // `Object.hasOwn`: an ABI has a "constructor" entry, and so does every object.
      if (Object.hasOwn(wanted, entry.type) && wanted[entry.type].includes(entry.name)) {
        kept[entry.type].set(signature(entry), entry);
      }
    }
  }
  for (const type of ["function", "event"]) {
    const found = new Set([...kept[type].values()].map((entry) => entry.name));
    const missing = wanted[type].filter((name) => !found.has(name));
    if (missing.length > 0) fail(`${name} has no ${type} ${missing.join(", ")} at ${source.commit}`);
  }

  write(name, "Only what the app calls or reads; the list is in scripts/sync-abis.mjs.", [
    ...sorted(kept.function),
    ...sorted(kept.event),
  ]);
  console.log(`abi:sync: src/abis/${name}.ts (${kept.function.size} functions, ${kept.event.size} events)`);
}

const errors = new Map();
for (const artifact of ERROR_ARTIFACTS) {
  for (const entry of artifactAbi(artifact)) {
    if (entry.type === "error") errors.set(signature(entry), entry);
  }
}
write("FarmentaErrors", "Every custom error a user transaction can revert with, for decoding.", sorted(errors));
console.log(`abi:sync: src/abis/FarmentaErrors.ts (${errors.size} errors)`);

writeFileSync(SOURCE_FILE, `${JSON.stringify(source, null, 2)}\n`);
