export type SignInProvider = "ahd" | "discord";

const START_URL = "https://lakesidegames.net/account/launcher/start";

/** The page that starts a browser sign-in and hands the code back to the loopback listener. */
export function buildSignInUrl(provider: SignInProvider, port: number, state: string): string {
  const query = new URLSearchParams({ provider, port: String(port), state });
  return `${START_URL}?${query.toString()}`;
}
