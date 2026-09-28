import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import { parseDeployment } from "./deployment";

const example = () =>
  JSON.parse(readFileSync(join(__dirname, "../../deployments/example.json"), "utf8")) as Record<string, unknown>;

describe("parseDeployment", () => {
  describe("positive", () => {
    it("reads the market, the lens and the policy of each tier", () => {
      const deployment = parseDeployment(example());

      expect(deployment.chainId).toBe(4663);
      // Checksummed, whatever case the file used.
      expect(deployment.collateralPolicy).toBe(getAddress("0x00000000000000000000000000000000000000c1"));
      expect(deployment.markets["blue-chip"]).toEqual({
        market: getAddress("0x00000000000000000000000000000000000000b1"),
        startBlock: 1n,
        lens: getAddress("0x00000000000000000000000000000000000000d1"),
      });
      expect(deployment.markets.meme).toEqual({
        market: getAddress("0x00000000000000000000000000000000000000b2"),
        startBlock: 1n,
        lens: getAddress("0x00000000000000000000000000000000000000d2"),
      });
    });

    it("needs nothing but the three entries it reads", () => {
      const { chainId, collateralPolicy, markets, lenses } = example();
      expect(() => parseDeployment({ chainId, collateralPolicy, markets, lenses })).not.toThrow();
    });

    it("reads every manifest committed in deployments/", () => {
      const dir = join(__dirname, "../../deployments");
      const names = readdirSync(dir).filter((name) => name.endsWith(".json"));
      expect(names).toContain("mainnet.json");

      for (const name of names) {
        const manifest: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
        expect(() => parseDeployment(manifest), name).not.toThrow();
      }
    });
  });

  describe("negative", () => {
    it("refuses a manifest for another chain", () => {
      expect(() => parseDeployment({ ...example(), chainId: 1 })).toThrow(/chain 1/);
    });

    it("refuses a manifest without a lens for a market", () => {
      const manifest = example();
      manifest.lenses = { blueChip: (manifest.lenses as Record<string, unknown>).blueChip };
      expect(() => parseDeployment(manifest)).toThrow(/lenses\.meme/);
    });

    it("refuses a market without the block its logs start at", () => {
      const manifest = example();
      manifest.markets = {
        ...(manifest.markets as Record<string, unknown>),
        blueChip: { address: "0x00000000000000000000000000000000000000b1" },
      };
      expect(() => parseDeployment(manifest)).toThrow(/markets\.blueChip\.startBlock/);
    });

    it("refuses an address that is not one", () => {
      const manifest = example();
      manifest.collateralPolicy = { address: "0x1234", startBlock: 1 };
      expect(() => parseDeployment(manifest)).toThrow(/collateralPolicy\.address/);
    });
  });

  describe("edge case", () => {
    it("refuses the zero address, which a contract that was not deployed would read as", () => {
      const manifest = example();
      manifest.markets = {
        ...(manifest.markets as Record<string, unknown>),
        meme: { address: "0x0000000000000000000000000000000000000000", startBlock: 0 },
      };
      expect(() => parseDeployment(manifest)).toThrow(/markets\.meme/);
    });

    it("refuses a contract the manifest lists as null", () => {
      expect(() => parseDeployment({ ...example(), collateralPolicy: null })).toThrow(/collateralPolicy/);
    });

    it("refuses something that is not a manifest at all", () => {
      expect(() => parseDeployment(null)).toThrow(/not an object/);
      expect(() => parseDeployment("0xabc")).toThrow(/not an object/);
    });
  });
});
