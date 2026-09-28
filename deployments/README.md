Address manifests, one file per deployment, chosen with `NEXT_PUBLIC_FARMENTA_DEPLOYMENT`.

Each file is the output of `script/manifest.sh` in the `smart-contract` repo, copied here
unchanged: the same file the indexer and the backend read (docs ARCHITECTURE.md §13, one
manifest). Nothing in it is edited by hand, and no Farmenta address is written anywhere else in
this repo.

```sh
# in smart-contract, after `forge script script/Deploy.s.sol --broadcast`
script/manifest.sh                                   # writes deployments/4663.json
cp deployments/4663.json ../web/deployments/mainnet.json
# in web
NEXT_PUBLIC_FARMENTA_DEPLOYMENT=mainnet pnpm build
```

The app reads three things from it: `markets.<name>.address`, `lenses.<name>.address` and
`collateralPolicy.address`. Addresses a contract reports itself are read from the contract and
not from the file: `asset()` for USDG, `policy()`, `positionManager()`.

With the variable unset the app still builds and every page opens; the action buttons are
disabled and say that the contracts are not deployed. With the variable set to a name that has
no file here, the build stops.

`mainnet.json` is the deployment on Robinhood Chain (4663) of 28 Sep 2026, built from `smart-contract`
`fc98221`; production sets `NEXT_PUBLIC_FARMENTA_DEPLOYMENT=mainnet`.

`example.json` shows the shape with placeholder addresses. `fork.json` is what `pnpm test:fork`
writes from its own rehearsal deploy; it is not committed.
