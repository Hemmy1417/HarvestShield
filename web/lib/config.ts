/**
 * The deployment this app reads and writes. The default is the deployment of
 * record, verified against contracts/harvestshield.py; an environment override
 * points a checkout at another deployment, and the app says so on every page.
 */
export const RECORD_ADDRESS = "0xC56Bf1aC6c749e24ce29c377A2D185ca38F99Ef4";

const override = process.env.NEXT_PUBLIC_HARVESTSHIELD_CONTRACT?.trim() ?? "";

export const CONTRACT_ADDRESS = (override || RECORD_ADDRESS) as `0x${string}`;
export const CONTRACT_CONFIGURED =
  /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS) && !/^0x0{40}$/.test(CONTRACT_ADDRESS);
export const IS_RECORD = CONTRACT_ADDRESS.toLowerCase() === RECORD_ADDRESS.toLowerCase();

/** The sha256 of the contract source these bytes were compiled from. */
export const SOURCE_SHA256 = "c3e181adeefad8ce8c9b21451227cb58eea2aa835df880fac6e80db3338a1c6b";

export const REPO_URL = "https://github.com/Hemmy1417/HarvestShield";
export const SOURCE_URL = `${REPO_URL}/blob/main/contracts/harvestshield.py`;
