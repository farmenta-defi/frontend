import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import { parseDeployment, tierOfMarket } from "./deployment";

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

describe("tierOfMarket", () => {
  const deployed = parseDeployment(example());

  describe("positive", () => {
    it("names the tier of each market of the deployment", () => {
      expect(tierOfMarket(deployed, "0x00000000000000000000000000000000000000b1")).toBe("blue-chip");
      expect(tierOfMarket(deployed, "0x00000000000000000000000000000000000000b2")).toBe("meme");
    });
  });

  describe("negative", () => {
    it("names no tier for an address that is not a market of the deployment", () => {
      // The blue-chip lens, and the policy: contracts of the deployment, and not markets.
      expect(tierOfMarket(deployed, "0x00000000000000000000000000000000000000d1")).toBeNull();
      expect(tierOfMarket(deployed, "0x00000000000000000000000000000000000000c1")).toBeNull();
      expect(tierOfMarket(deployed, "")).toBeNull();
    });
  });

  describe("edge case", () => {
    it("reads the address in whatever case it is written: the backend sends lowercase, the manifest a checksum", () => {
      expect(tierOfMarket(deployed, "0x00000000000000000000000000000000000000B1")).toBe("blue-chip");
      expect(tierOfMarket(deployed, getAddress("0x00000000000000000000000000000000000000b2"))).toBe("meme");
    });

    it("names no tier without a deployment", () => {
      expect(tierOfMarket(null, "0x00000000000000000000000000000000000000b1")).toBeNull();
    });

    it("names the two markets of the mainnet manifest, and not the market of the deployment it replaced", () => {
      const mainnet = parseDeployment(
        JSON.parse(readFileSync(join(__dirname, "../../deployments/mainnet.json"), "utf8")),
      );

      expect(tierOfMarket(mainnet, "0x89e20d2bbbbf52bf8036bf8efd94c81c8386116b")).toBe("blue-chip");
      expect(tierOfMarket(mainnet, "0x01540c8aa1c13d50da85406dca012f9f41169927")).toBe("meme");
      // The Blue-chip market of the 28 Sep 2026 deployment, which the recorded answers in
      // src/lib/backend/fixtures still carry. The app has no page for it any more.
      expect(tierOfMarket(mainnet, "0x1f69d27f1ac7415a4252957951900130cb885484")).toBeNull();
    });
  });
});
