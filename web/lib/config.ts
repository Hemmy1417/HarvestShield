/**
 * The deployment this app reads and writes. The default is the deployment of
 * record, verified against contracts/harvestshield.py; an environment override
 * points a checkout at another deployment, and the app says so on every page.
 */
export const RECORD_ADDRESS = "0x0000000000000000000000000000000000000000";

const override = process.env.NEXT_PUBLIC_HARVESTSHIELD_CONTRACT?.trim() ?? "";

export const CONTRACT_ADDRESS = (override || RECORD_ADDRESS) as `0x${string}`;
export const CONTRACT_CONFIGURED =
  /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS) && !/^0x0{40}$/.test(CONTRACT_ADDRESS);
export const IS_RECORD = CONTRACT_ADDRESS.toLowerCase() === RECORD_ADDRESS.toLowerCase();

/** The sha256 of the contract source these bytes were compiled from. */
export const SOURCE_SHA256 = "";

export const REPO_URL = "https://github.com/Hemmy1417/HarvestShield";
export const SOURCE_URL = `${REPO_URL}/blob/main/contracts/harvestshield.py`;
