/**
 * The deployment this app reads and writes. The default is the deployment of
 * record, verified against contracts/harvestshield.py; an environment override
 * points a checkout at another deployment, and the app says so on every page.
 */
export const RECORD_ADDRESS = "0xEE527C8caE9B1D7B543ADA775E4054E9b49ab6e6";

const override = process.env.NEXT_PUBLIC_HARVESTSHIELD_CONTRACT?.trim() ?? "";

export const CONTRACT_ADDRESS = (override || RECORD_ADDRESS) as `0x${string}`;
export const CONTRACT_CONFIGURED =
  /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS) && !/^0x0{40}$/.test(CONTRACT_ADDRESS);
export const IS_RECORD = CONTRACT_ADDRESS.toLowerCase() === RECORD_ADDRESS.toLowerCase();

/** The sha256 of the contract source these bytes were compiled from. */
export const SOURCE_SHA256 = "8215c6681cceb48742f8ff14eef1c435ac6cd025e77563713e5b2403732b384e";

export const REPO_URL = "https://github.com/Hemmy1417/HarvestShield";
export const SOURCE_URL = `${REPO_URL}/blob/main/contracts/harvestshield.py`;
